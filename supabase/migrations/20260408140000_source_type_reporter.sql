-- NIH RePORTER as first-class source_type (funding from api.reporter.nih.gov)
-- Enum add only: new values cannot be used in the same transaction (PostgreSQL 55P04).
-- Backfill runs in the next migration after this commits.

alter type public.source_type add value if not exists 'reporter';
