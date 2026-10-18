"""Sentry for the server (contract section 11): errors, tracing, logs, profiling.

Does nothing until SENTRY_DSN is set, so local dev and tests are unaffected.
"""
import logging
import os

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

log = logging.getLogger("carecall.sentry")


def init() -> bool:
    dsn = os.environ.get("SENTRY_DSN", "")
    if not dsn:
        log.info("SENTRY_DSN not set, Sentry is off")
        return False
    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "hackathon"),
        release=os.environ.get("RAILWAY_GIT_COMMIT_SHA") or None,
        traces_sample_rate=1.0,          # tracing: every request (hackathon traffic is tiny)
        profile_session_sample_rate=1.0,  # profiling
        profile_lifecycle="trace",
        enable_logs=True,                 # Sentry Logs
        send_default_pii=False,           # no phone numbers or IPs in Sentry
        integrations=[LoggingIntegration(level=logging.INFO, event_level=logging.ERROR)],
    )
    log.info("Sentry on (%s)", os.environ.get("SENTRY_ENVIRONMENT", "hackathon"))
    return True
