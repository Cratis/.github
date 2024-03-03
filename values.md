# Values

We value:

* Empathy
* Maintainability
* Readability
* Testability
* Frictionless software
* Consistency in the codebase
* Element of least surprise
* Automation

## Empathy

Understanding who we are building for is vital to get it right. This is best
achieved through listening to input, being open to change and being inquisitive towards the persona.
It applies at all levels, be it an API or tool being used by another developer all the way to the end-user
using the software through a user interface.

## Maintainability

Once code is in production it tends to live on for years. The initial development of the code is
therefor often then just a fraction of the time of its lifetime. It is therefor imperative that we create
code that can live on beyond the initial development. Writing simple code that is easy to reason
about that can fit inside your head is a good rule of thumb. Maintainability reaches also into
architectural design patterns and we believe in decoupling our software, breaking it up into
smaller pieces and making it composable as key points to achieve maintainability.

## Readability

Code should be understood at a glance, naming is key to achieving this. An example of this is
to not use acronyms or shortening, unless it is globally well understood such as Xml or Json.
We're not trying to save keystrokes. Another part of readability is to break up code into smaller
chunks that are focused - rather than having one large method for instance, you could break up
into smaller methods with clear and well defined names and then compose it together in the original
method. If needed, add comments as explanation when it doesn't feel right to do such a break up.

## Testability

We believe that our code should be tested. The tests should serve as a specification of the system,
for other developers to easily understand the behavior of the system. We favor BDD (Behavior Driven Design)
over TDD (Test Driven Development) to accomplish this.

Tests or specs as we refer to them as, give us the comfort of knowing early on if we have side-effects
of any change we bring to the software. In order to accomplish testable code, one has to write code
that is able to be tested. At the lowest level of testing we want to specify units in isolation and
its behaviors. By representing dependencies through interfaces makes it possible to create fake / mock / stubs
that lets us not worry about the actual implementation of the dependency and trust that it will have
its own set of specifications to verify its behaviors.

There are levels of testing:

* Unit
* Integration
* UI/Frontend

In addition, there are scenarios where you want to test for resource utilization such as CPU, memory and
also the responsiveness of a system. Common is also to write tests to test failures.

## Frictionless software

We want to be able to release software frictionless when we want or need to. This is accomplished
by breaking up software into smaller chunks into things like microservices or even down to serverless
solutions. By then truly decoupling these smaller chunks from each other, we can release every part
independently. This enables true agility and we increase our responsiveness in the case of having to
do bug fixing. With the safety of automated tests for our software we provide a safety harness that
should enable us to do this.

## Consistency in the codebase

In general terms; the code stays on in a project longer than its members. Having consistency in the
codebase that is adhering to the agreed upon standards is therefor vital. Consistency also makes it
predictable. You know the pattern and can easily navigate once you know the pattern.

## Element of least surprise

Surprises belong to birthdays, not in code. Code should be predictable, it should deliver on its promise
consistently and not deviate from what it is promising ever.

## Automation

Every day we have tasks that are being done repeatedly. Chances are good they can be automated.
If a computer can do it, make it do it. This would then take away tedious tasks and at the same
time reduce the possibility of human error.

Examples of automation is naturally towards building, automated testing of software on commits
and all the way to releasing and deploying software into production.
 
Within our code there are also opportunities of automation. These are identified as repetitive
code that we tend to copy/paste around or we're following a recipe that tells us what to do.
These can be centralized and applied as what is known as [cross-cutting concerns](https://en.wikipedia.org/wiki/Cross-cutting_concern).
