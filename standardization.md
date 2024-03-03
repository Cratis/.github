# Standardization

The goal of having a somewhat consistent codebase that is standardized is to avoid being completely
dependent on individuals and make it easier to let the teams have a global ownership.

In a dynamic world were people changes jobs often, the code has to live beyond each individual.
It helps mitigate risks and by being consistent, anyone can pick up any code.

## Language

Technical abstract reusable code should be written in English, domain specific code can be written
in the language that makes sense for the domain. The thinking behind this is that it can be hard
and maybe even impossible to properly capture a domains language in another language than where the domain
originates from. This is with the [DDD ubiquitous language](https://www.martinfowler.com/bliki/UbiquitousLanguage.html) in mind.

## Cohesion

Rather than splitting up code on technical concerns. In an MVC based solution instead of having a folder
for each of the letters in the acronym **Models**, **Views** and **Controllers**, you should take the artifacts
and put them all together in a well named folder for the feature/module/component you're building out.
The name should reflect the domain language.

For different technical concerns representing frontend, backend you'd naturally separate these into different projects/higher level
folders but maintain the structure within both projects/folders.
