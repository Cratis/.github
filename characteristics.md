# Characteristics

Instead of purely adhering to principles, we're looking for certain characteristics of a system and its
codebase. Sure, some of these characteristics can be found described in principles.

## The Why

The reason we look for a certain set of characteristics is that we want to put ourselves into the pit
of success to be able to create a maintainable system and at the same time be able to be agile and
deliver business value in a timely fashion.

## CUPID

As a response to whether or not the [SOLID principles](https://en.wikipedia.org/wiki/SOLID) are outdated, Dan North
came up with an alternative acronym [CUPID](https://dannorth.net/2021/03/16/cupid-the-back-story/).
The purpose of this is to describe characteristics one should favor in a system rather than principles
of how to do something. Recommend listening to Dan explain the background and his conclusions [here](https://dotnetrocks.com/?show=1745).

### Composable

Things should play nice with each other. This enables us to put together our software however we see fit.
It is important to not create couplings and the different components should avoid having dependencies that hinders
it from being composable. This can be applied to all levels of the software.

### Unix philosophy

Do one thing and do it well. Where Single Responsibility Principle talks about having one reason to change, this is
different in the way that is talks about the behavior. Examples of this in the Unix world is things like the command `ls`.
Its purpose is to list the content of a directory in your filesystem and can only do that.

Linking back to being composable, your typical Unix command supports piping and chaining making it possible to compose
commands - for instance you can pipe the result of `ls` into `grep` and do a search.

### Predictable

Systems should have a predictable deterministic outcome. From a user or an API consumer perspective what you're exposing
should deliver on what it is promising - consistently.

Predictability is also about general behavior,  performance and resource utilization.

### Idiomatic

Code should adhere to the language, culture of the community within the ecosystem you're in. It should be what people are expecting to see
and feel familiar.

### Domain based

Use vocabulary and naming that is natural for the domain you're writing the software for. Much like the concepts found in
[Domain Driven Designs ubiquitous language](https://www.martinfowler.com/bliki/UbiquitousLanguage.html).
In addition to naming, structure the solution to reflect the domain and not reflect technical concerns.
Maintain cohesiveness in the structure, code that is relevant for a module/component should be kept together.
This helps in discoverability for new developers and maintenance over time.

## Frictionless

Dependencies can represent a coupling which then adds friction to the system. Friction presents itself in the form of
being able to release. If you end up in a situation where you need to coordinate releases there is a chance you have
an unhealthy dependency.

## 12Factor

As a methodology for how we develop, deploy and run our systems we work with the [12factor](https://12factor.net) methodology.
This is a formalization of the work and experience done at Heroku. It contains characteristics one wants in a system for it
to be able to scale, grow and be maintainable for years.
