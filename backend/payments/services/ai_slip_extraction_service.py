# backend/payments/services/ai_slip_extraction_service.py
"""
✅ NEW: AI-based slip reading, as a smarter companion to ocr_service.py.

Why this exists: the old pipeline was Tesseract OCR → regex on whatever
text came out. That's brittle for real parent-uploaded photos — tilted,
shadowed, low-res, sometimes a screenshot of a screenshot — and the
transaction reference in particular is the field regex struggles with
most, because banks don't all label it the same way ("Ref No", "TT No",
"Trx ID", or nothing at all, just a bare code near the top).

This sends the slip IMAGE directly to Claude (not the noisy OCR text) and
asks for the same fields as a strict JSON object. Claude reads the actual
photo the way a person would, so it isn't limited to a fixed set of
regex patterns.

This is additive, not a replacement: if no ANTHROPIC_API_KEY is
configured, or the call fails for any reason (network, rate limit,
invalid image), extract_with_ai() returns None and ocr_service.py falls
straight back to the existing Tesseract+regex result — nothing about the
old behavior breaks if this isn't set up.
"""
import base64
import json
import logging
import mimetypes

from django.conf import settings

logger = logging.getLogger(__name__)

# A vision-capable Claude model. Picked for the accuracy/cost balance of
# reading a single small photo — this doesn't need the largest model.
_MODEL = "claude-sonnet-5"

_SYSTEM_PROMPT = """You are reading a photo of an Ethiopian bank payment \
slip or mobile money (Telebirr) transaction screenshot, submitted by a \
parent as proof of a school fee payment.

Extract exactly these fields and return ONLY a JSON object — no prose, \
no markdown fences, nothing else:

{
  "amount": <number or null>,
  "bank_name": <string or null>,
  "reference_number": <string or null>,
  "account_number": <string or null>,
  "transaction_date": <string or null>,
  "student_reference": <string or null>
}

Rules:
- reference_number is the single most important field. Banks label it \
differently — "Ref No", "Reference", "TT No", "Trx ID", "Transaction ID", \
"FT" or "TT" prefixed codes, or sometimes it has no label at all and is \
just a code near the top or bottom of the slip. Use your judgment the \
way a human reviewer would, not a fixed pattern.
- If a field genuinely isn't visible or legible, use null. Never invent \
or guess a value — a wrong reference number is worse than a missing one.
- amount must be a plain number (no currency symbol, no commas).
- Ignore any text that is clearly a bank logo, slogan, or footer legal \
text, not transaction data."""


def _client():
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
    if not api_key:
        return None
    try:
        import anthropic
        return anthropic.Anthropic(api_key=api_key)
    except Exception as e:
        logger.warning(f"AI slip extraction unavailable (anthropic client init failed): {e}")
        return None


def extract_with_ai(image_path):
    """
    Returns a dict with the fields above on success, or None if the AI
    path isn't available/failed for any reason — caller should treat None
    as "fall back to OCR-only", not as an error to surface to the user.
    """
    client = _client()
    if client is None:
        return None

    try:
        with open(image_path, 'rb') as f:
            image_bytes = f.read()

        media_type = mimetypes.guess_type(image_path)[0] or 'image/jpeg'
        if media_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'):
            # Unsupported type for the vision API — let OCR handle it alone.
            return None

        image_b64 = base64.standard_b64encode(image_bytes).decode('utf-8')

        response = client.messages.create(
            model=_MODEL,
            max_tokens=500,
            system=_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": "Extract the fields from this payment slip.",
                    },
                ],
            }],
        )

        raw_text = "".join(
            block.text for block in response.content if getattr(block, 'type', None) == 'text'
        ).strip()

        # Defensive: strip markdown fences if the model adds them anyway.
        if raw_text.startswith('```'):
            raw_text = raw_text.strip('`')
            if raw_text.startswith('json'):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        parsed = json.loads(raw_text)

        return {
            'amount': parsed.get('amount'),
            'bank_name': parsed.get('bank_name'),
            'reference_number': parsed.get('reference_number'),
            'account_number': parsed.get('account_number'),
            'transaction_date': parsed.get('transaction_date'),
            'student_reference': parsed.get('student_reference'),
        }

    except FileNotFoundError:
        logger.error(f"AI slip extraction: image not found at {image_path}")
        return None
    except json.JSONDecodeError as e:
        logger.warning(f"AI slip extraction: model did not return valid JSON: {e}")
        return None
    except Exception as e:
        # Any API error (auth, rate limit, network, etc.) — never let this
        # block the upload flow. OCR-only result is still a valid result.
        logger.warning(f"AI slip extraction failed, falling back to OCR-only: {e}")
        return None
