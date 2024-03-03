# Contributing

To contribute you should read through our guidelines to make it easier to get pull requests
approved.

The following specific topics are important:

* [Naming](./naming.md)
* [Standardization](./standardization.md)
  * [C#](csharp.md)

## Size

Contributions, be it features or bug fixes should be small and digestible.
The contribution will be reviewed before it can be accepted and the smaller it is, the faster it will be reviewed.

## Branches

The **master/main** branch represents what is in production.
When contributing, do so by creating a branch adhering to the following naming conventions:

* feature/[name of feature]
* fix/[name of fix]
* chore/[chore description]

Branches are to be deleted once merged into **master/main** branch. There should be no long living branches other than **master/main**.

> Note:
> For public repositories were you're not a member of the team, you'll have to do a [fork](https://docs.github.com/en/get-started/quickstart/fork-a-repo) first.
> Public repositories have a different target audience and commitment to strong semantic versioning. This manifests itself in having branches that when there
> are breaking changes/major version releases, what goes into the release has to be more coordinated. This then results in long lived branches representing the
> specific target version. Branches are made from this and merged into the version branch. The version branch is then used
> as a pull request to **master/main**.

## Pull Requests

All contributions to both private and public repositories are done through pull requests to the repository you're contributing to.
Anyone reviewing will keep in mind the guidelines described here.

### General

Pull requests will run automated checks for verification, these typically include:

* Static code analysis
* Build
* Automated tests

If all of the verifications steps pass, the code will be reviewed.

### Private repositories

Pull requests that are merged to **main/master** will be entered into the release pipeline.
All pull requests should also be [squash-merged](https://docs.microsoft.com/en-us/azure/devops/repos/git/merging-with-squash?view=azure-devops) and will be enforced when possible.

Private repositories are versioned automatically when built for release.
The version number is created from the current date and an auto-incremented revision number for the day.

**yyyy.MM.dd.revision**

e.g.

**2022.03.29.1**

### Public repositories

A contribution can trigger a versioned release. The versioning is adhering to [semantic versioning version 2](https://semver.org)
and leveraging our own [release action](https://github.com/cratis/release-action) for this.
That means that the pull request will have to be labeled with what version change it constitutes:

| Name | Description |
| ---- | ----------- |
| Major | Breaking changes has been implemented in public APIs and/or behavior |
| Minor | New capabilities has been added |
| Patch | Bug fixes |

If none of these labels are present, it isn't considered to be a release.

The repositories are configured with the pull request template that will guide you through what to fill in.
