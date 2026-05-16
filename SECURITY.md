# Security Policy

## Supported Versions

This is a personal static website. Security fixes are applied to the
latest code on `main`; there are no separately maintained release
lines.

| Version | Supported |
| ------- | --------- |
| latest  | ✓         |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security
vulnerabilities.

Report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/niclaslindstedt/budget/security/advisories/new).

**Response expectations:**

- Acknowledgment within 7 days.
- Triage and initial response within 14 days.

## Disclosure Policy

We follow
[coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure):
vulnerabilities are kept private until a fix is ready, then disclosed
publicly alongside the fix. Typical disclosure window: 90 days from
acknowledgment, or sooner when a fix is available.

## Scope

**In scope:**

- Cross-site scripting (XSS) in the deployed site.
- Local-storage data leakage via the import / export surface.
- Dependency vulnerabilities with a realistic exploitation path.
- GitHub Actions workflow vulnerabilities (secret exposure, injection).

**Out of scope:**

- Social engineering attacks.
- Vulnerabilities in the GitHub platform itself.
- Reports with no realistic exploitation path.
