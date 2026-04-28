# Contributing to StellarKraal

Thank you for contributing to StellarKraal! This project welcomes contributions that improve code quality, documentation, developer experience, and user workflows.

## Table of Contents

- [Getting Started](#getting-started)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Code Review Expectations](#code-review-expectations)
- [Testing Locally](#testing-locally)
- [Reporting Issues](#reporting-issues)

## Getting Started

1. Fork the repository to your GitHub account.
2. Clone your fork:

```bash
git clone https://github.com/<your-username>/StellarKraal-.git
cd StellarKraal-
```

3. Add the upstream remote:

```bash
git remote add upstream https://github.com/teslims2/StellarKraal-.git
git fetch upstream
```

4. Create a local branch from `main`:

```bash
git checkout main
git pull upstream main
git checkout -b <branch-name>
```

## Branch Naming

Use concise, purpose-driven branch names that include the type of work.

Examples:

- `feat/add-payment-calculation`
- `fix/login-validation`
- `docs/update-readme`
- `chore/upgrade-dependencies`
- `ci/add-backend-actions`

Prefixes:

- `feat/` — new feature or enhancement
- `fix/` — bug fix
- `docs/` — documentation only changes
- `chore/` — maintenance or refactor not directly adding features
- `ci/` — continuous integration and workflow updates

## Commit Messages

Follow the Conventional Commits format:

```text
<type>(optional-scope): <short-description>

[optional body]

[optional footer]
```

Common types:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Formatting, missing semi-colons, code style changes
- `refactor`: Code changes that neither fix a bug nor add a feature
- `perf`: Improvements to performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Maintenance tasks

Example:

```bash
git commit -m "docs(readme): add project architecture overview"
```

## Pull Request Process

1. Branch from the latest `main`.
2. Make small, focused changes.
3. Run tests locally.
4. Open a pull request with a descriptive title.
5. Reference related issues using `#<issue-number>`.
6. Describe what changed and why.

Example PR title:

```text
docs: add CONTRIBUTING and PR template
```

## Code Review Expectations

Please expect the following from reviewers:

- Review turnaround: within 2 business days.
- Requests for changes are normal; address them promptly.
- Keep discussions focused on behavior, correctness, and maintainability.
- Update tests or documentation when behavior changes.

When you are reviewing:

- Confirm the change matches the issue or feature request.
- Check for readable commits and appropriate scope.
- Verify tests are included for bug fixes or new features.
- Ensure documentation updates accompany user-facing changes.

## Testing Locally

### Backend

```bash
cd backend
npm install
npm test
```

### Frontend

```bash
cd frontend
npm install
npm test
```

### Smart Contracts

```bash
cd contracts/stellarkraal
cargo test
```

### Full repository tests

```bash
npm run test:contract
npm run test:backend
npm run test:frontend
```

## Reporting Issues

If you find a bug or want to request a feature:

1. Search existing issues first.
2. Open a new issue with a clear title.
3. Include steps to reproduce and expected behavior.
4. Tag the relevant area, such as backend, frontend, or docs.
