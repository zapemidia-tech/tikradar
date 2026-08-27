# TikRadar Information Security Policy

Version 1.0 — 2026-08-26 — review at least annually.

## Scope and ownership
This policy covers TikRadar source code, production services, administrative endpoints, OAuth credentials, databases, logs and devices used to administer the service. The business owner is accountable for enforcement and records exceptions in writing.

## Access control
- Access is individual, authenticated and granted on least privilege.
- Administrative accounts use multi-factor authentication where supported.
- Production secrets are server-side only and are never committed to source control.
- Access is reviewed quarterly and removed immediately when no longer required.
- OAuth actions require an authenticated TikRadar identity and CSRF state validation.

## Data classification and encryption
- Public: published rankings and public policy pages.
- Internal: product plans and non-sensitive operational records.
- Confidential: user contact details, request records and internal logs.
- Restricted: App Secrets, encryption keys, OAuth tokens and service-role credentials.

Restricted data must use TLS in transit and authenticated encryption at rest. TikTok OAuth tokens use AES-256-GCM with a unique random IV. Encryption keys are stored separately from ciphertext.

## Secure development and vulnerabilities
Changes must pass tests, type checking, lint and production build. Dependency and platform alerts are reviewed at least monthly. Confirmed critical vulnerabilities are targeted within 72 hours, high severity within 14 days and medium severity within 30 days. Exposed secrets are rotated immediately.

## Endpoint baseline
Administrative devices use a supported operating system, automatic security updates, automatic screen locking, strong unique credentials, built-in anti-malware protection and full-disk encryption where available.

## Review
This policy is reviewed annually, after a material architecture change and after any security incident.
