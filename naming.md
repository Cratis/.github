# Naming

An important aspect of creating maintainable code is its readability.
Part of readability is the naming of artifacts such as files, type names and methods.
Code should be written in a way that makes it obvious what it is doing from the
naming. That way anyone visiting the code can understand what it is trying to achieve
at a glance.

## Abbreviations

Unless it is a well understood abbreviation, such as **XML**, **JSON** or something
that is well understood in the domain you're targeting, abbreviations should be used.

## Pluralization

Features in a system is often a representation of a noun in the domain you're working on.
You should look at it as a grouping and therefor pluralize the name.

For instance, lets say you have a concept called **Employee**. The feature working on
it would then be **Employees**.

This applies to database schemas, folders for containing the feature, API routes
and in general groupings.

### Examples

Folder structure

    <Project>
    ├─── Read
    │    └─── Employees
    │         └─── Employee.cs
    |         └─── Queries.cs
    ├─── Web
    │    └─── Employees
    │         └─── Employee.tsx

API route

    /api/Employees/{employeeId}/details

    /api/Employees/8e6bf5b7-9fbb-4ce8-969c-d8d96b9e40dc/details

## Prefix / postfix

Adding a prefix or postfix to type names should only be added if it adds value
and increases the general understanding.
Instead of adding post/pre-fixes; make the naming unambiguous and reflect
what it is doing, not what technical shape and/or pattern it is adhering to as
that can change over time.

Below are examples that should be avoided.

* Controller
* ViewModel
* Exception
* Factory
* Manager

Adding `Base` to a base type is another example of pre/post-fix that in general
does not say what it is doing and should be avoided.
