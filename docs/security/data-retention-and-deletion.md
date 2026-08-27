# TikRadar Data Retention and Deletion Standard

Version 1.0 — 2026-08-26.

| Data | Default retention | Disposal |
| --- | --- | --- |
| OAuth access/refresh tokens | Active authorization only | Delete on revocation, termination or verified request |
| TikTok connection metadata | Active relationship plus up to 30 days for closure | Delete or irreversibly anonymize |
| Privacy requests | Up to 5 years for compliance evidence | Secure deletion |
| Security audit events | 12 months unless an investigation requires longer | Automated or reviewed deletion |
| Bestsellers snapshots | While needed for trend analysis and allowed by TikTok terms | Delete or aggregate when no longer required |
| Application diagnostic logs | 30 days by default | Provider-controlled expiration |

Verified deletion requests remove connection tokens first, then user-linked records. Backups age out under the provider lifecycle and are not restored for ordinary use after a deletion request.
