# Changelog

All notable changes to StellarKraal are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- A responsive dashboard metrics strip for active loans, total collateral value, and at-risk loans, with links to the corresponding detail views ([#1433](https://github.com/Mystery-CLI/StellarKraal-/issues/1433)).

### Changed
- Replaced the phone-width hamburger navigation with four keyboard-accessible bottom tabs and iOS safe-area spacing ([#1088](https://github.com/Mystery-CLI/StellarKraal-/issues/1088)).
- Standardized release notes on Keep a Changelog categories and configured release-please to group Conventional Commit types ([#1435](https://github.com/Mystery-CLI/StellarKraal-/issues/1435)).

### Fixed
- Dashboard portfolio data now uses the borrower-scoped aggregate endpoint, and owner collateral loading uses the supported owner filter.

### Security
- Configured Helmet with a restrictive Content-Security-Policy, clickjacking and MIME-sniffing protections, production-only one-year HSTS, and removal of server fingerprinting headers ([#1434](https://github.com/Mystery-CLI/StellarKraal-/issues/1434)).

## [1.0.0] - 2024-01-15

### Added
- Initial stable release of the StellarKraal platform.
- User authentication with JWT and user registration and login endpoints ([#1](https://github.com/teslims2/StellarKraal-/issues/1), [#2](https://github.com/teslims2/StellarKraal-/issues/2)).
- Role-based access control for administrators, users, and moderators ([#3](https://github.com/teslims2/StellarKraal-/issues/3)).
- Collateral management endpoints for creating, listing, viewing, updating, and deleting collateral ([#4](https://github.com/teslims2/StellarKraal-/issues/4), [#5](https://github.com/teslims2/StellarKraal-/issues/5), [#6](https://github.com/teslims2/StellarKraal-/issues/6), [#7](https://github.com/teslims2/StellarKraal-/issues/7), [#8](https://github.com/teslims2/StellarKraal-/issues/8), [#9](https://github.com/teslims2/StellarKraal-/issues/9)).
- Loan management endpoints for creating, listing, viewing, and updating loan status ([#10](https://github.com/teslims2/StellarKraal-/issues/10), [#11](https://github.com/teslims2/StellarKraal-/issues/11), [#12](https://github.com/teslims2/StellarKraal-/issues/12), [#13](https://github.com/teslims2/StellarKraal-/issues/13), [#14](https://github.com/teslims2/StellarKraal-/issues/14)).
- Administrative user, collateral, and loan management routes ([#15](https://github.com/teslims2/StellarKraal-/issues/15), [#19](https://github.com/teslims2/StellarKraal-/issues/19), [#22](https://github.com/teslims2/StellarKraal-/issues/22)).
- Database schema and migrations, including users, collateral, loans, and soft-delete support ([#26](https://github.com/teslims2/StellarKraal-/issues/26), [#30](https://github.com/teslims2/StellarKraal-/issues/30)).
- Connection pooling, input validation, error handling, automated tests, OpenAPI documentation, environment configuration, CORS, and rate limiting ([#31](https://github.com/teslims2/StellarKraal-/issues/31), [#32](https://github.com/teslims2/StellarKraal-/issues/32), [#33](https://github.com/teslims2/StellarKraal-/issues/33), [#34](https://github.com/teslims2/StellarKraal-/issues/34), [#35](https://github.com/teslims2/StellarKraal-/issues/35), [#36](https://github.com/teslims2/StellarKraal-/issues/36), [#37](https://github.com/teslims2/StellarKraal-/issues/37), [#38](https://github.com/teslims2/StellarKraal-/issues/38)).
- Logging infrastructure and a health-check endpoint ([#39](https://github.com/teslims2/StellarKraal-/issues/39), [#40](https://github.com/teslims2/StellarKraal-/issues/40)).

### Changed
- Updated authentication to use JWT refresh tokens, improved validation error messages, and optimized database queries with indexes ([#41](https://github.com/teslims2/StellarKraal-/issues/41), [#42](https://github.com/teslims2/StellarKraal-/issues/42), [#43](https://github.com/teslims2/StellarKraal-/issues/43)).

### Deprecated
- Legacy authentication middleware was deprecated ahead of its removal ([#49](https://github.com/teslims2/StellarKraal-/issues/49)).

### Removed
- Removed legacy authentication middleware and unused v0.9 endpoints ([#49](https://github.com/teslims2/StellarKraal-/issues/49), [#50](https://github.com/teslims2/StellarKraal-/issues/50)).

### Fixed
- Fixed user-role updates, collateral deletion cascades, loan status transition validation, and frontend CORS configuration ([#45](https://github.com/teslims2/StellarKraal-/issues/45), [#46](https://github.com/teslims2/StellarKraal-/issues/46), [#47](https://github.com/teslims2/StellarKraal-/issues/47), [#48](https://github.com/teslims2/StellarKraal-/issues/48)).

### Security
- Added CORS and security headers, rate limiting, and Helmet middleware ([#37](https://github.com/teslims2/StellarKraal-/issues/37), [#38](https://github.com/teslims2/StellarKraal-/issues/38), [#44](https://github.com/teslims2/StellarKraal-/issues/44)).

## [0.9.0] - 2023-12-01

### Added
- Initial prototype of the StellarKraal platform.
- Basic user authentication, loan creation, and Stellar network integration.

### Changed
- Refactored authentication to use JWT.

### Fixed
- Various bug fixes and improvements.

[Unreleased]: https://github.com/Mystery-CLI/StellarKraal-/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Mystery-CLI/StellarKraal-/releases/tag/v1.0.0
[0.9.0]: https://github.com/Mystery-CLI/StellarKraal-/releases/tag/v0.9.0
