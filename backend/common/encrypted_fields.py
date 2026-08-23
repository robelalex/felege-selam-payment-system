# backend/common/encrypted_fields.py
"""
✅ SECURITY FIX: transparent at-rest encryption for sensitive text
columns — introduced specifically for School.chapa_api_key and
School.chapa_webhook_secret, which were previously stored as plain
CharField. A single database leak/backup exposure used to hand out
every school's live Chapa payment credentials at once; with this,
the same leak only exposes ciphertext.

DESIGNED TO NEVER BREAK AN EXISTING DEPLOYMENT:
  1. If settings.FIELD_ENCRYPTION_KEY is not set, this field behaves
     as a transparent passthrough (reads/writes plain text exactly
     like the CharField it replaces) and logs a warning once. Nothing
     crashes and nothing changes for anyone who hasn't set the new
     env var yet.
  2. Once FIELD_ENCRYPTION_KEY IS set: new values written are
     encrypted. Existing legacy plaintext values already in the
     database are still read back correctly — decryption is
     attempted first, and if the stored value isn't a valid Fernet
     token (i.e. it's old plaintext), it's returned as-is. There is
     no destructive migration required; the moment a school's Chapa
     settings are next saved (e.g. re-entering the key in School
     Settings), that row is encrypted going forward.
  3. All existing code that does `school.chapa_api_key` or
     `school.chapa_webhook_secret` keeps working unchanged — this is
     a drop-in replacement for CharField, not a new access pattern.

SETUP (do this once, in your environment/secrets, not in code):
  1. Generate a key locally:
         python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  2. Set it as the FIELD_ENCRYPTION_KEY environment variable in your
     deployment (Render dashboard -> Environment, same place
     DJANGO_SECRET_KEY lives). Keep this secret and back it up
     somewhere safe (e.g. a password manager) — if it's ever lost,
     every already-encrypted value becomes unrecoverable.
  3. Add `cryptography` to requirements.txt (already done in this
     change) and redeploy.
  4. Nothing else needs to run manually. Existing plaintext keys keep
     working immediately (step 2 above); they'll silently upgrade to
     encrypted storage the next time each school's Chapa settings are
     saved.
"""
import logging
from django.db import models

logger = logging.getLogger(__name__)

_warned_no_key = False


def _get_fernet():
    """Returns a Fernet instance, or None if no key is configured
    (passthrough mode) or the `cryptography` package isn't installed."""
    global _warned_no_key
    from django.conf import settings
    key = getattr(settings, 'FIELD_ENCRYPTION_KEY', None)
    if not key:
        if not _warned_no_key:
            logger.warning(
                "FIELD_ENCRYPTION_KEY is not set — sensitive fields "
                "(e.g. Chapa API keys) are being stored in PLAIN TEXT. "
                "See common/encrypted_fields.py for setup instructions."
            )
            _warned_no_key = True
        return None
    try:
        from cryptography.fernet import Fernet
        if isinstance(key, str):
            key = key.encode('utf-8')
        return Fernet(key)
    except Exception:
        logger.exception(
            "FIELD_ENCRYPTION_KEY is set but invalid, or the "
            "'cryptography' package is not installed — falling back to "
            "plain text storage for sensitive fields."
        )
        return None


class EncryptedCharField(models.TextField):
    """
    Drop-in replacement for CharField on sensitive columns. Stored as
    TEXT in the database (ciphertext is longer than the original
    plaintext), but behaves like a normal CharField in Python — you
    read and write plain strings, never ciphertext, directly.
    """

    def from_db_value(self, value, expression, connection):
        if value is None or value == '':
            return value
        fernet = _get_fernet()
        if fernet is None:
            return value
        try:
            return fernet.decrypt(value.encode('utf-8')).decode('utf-8')
        except Exception:
            # Not a valid Fernet token — this is a legacy plaintext
            # value written before encryption was configured. Return
            # it as-is rather than erroring; it will be encrypted the
            # next time this row is saved.
            return value

    def to_python(self, value):
        if value is None or isinstance(value, str):
            return value
        return str(value)

    def get_prep_value(self, value):
        if value is None or value == '':
            return value
        fernet = _get_fernet()
        if fernet is None:
            return value
        return fernet.encrypt(str(value).encode('utf-8')).decode('utf-8')
