from __future__ import annotations

import argparse
import asyncio
import json
import time
from pathlib import Path

import httpx
from anyio import Path as AsyncPath

from app.config import get_settings
from app.services.providers import ProviderAsset, anchor_is_grounded, build_providers


async def run_smoke(document_path: Path) -> None:
    settings = get_settings()
    settings.ensure_runtime_safety()
    providers = build_providers(settings)
    asset = ProviderAsset(
        content=await AsyncPath(document_path).read_bytes(),
        mime_type="application/pdf",
        filename=document_path.name,
        page_index=1,
    )
    try:
        parse_started = time.monotonic()
        parsed = await providers.parser.parse([asset])
        parse_seconds = time.monotonic() - parse_started

        studio_started = time.monotonic()
        try:
            understanding = await providers.understanding.understand(parsed)
        except httpx.HTTPStatusError as exc:
            response_text = exc.response.text[:1000]
            print(
                json.dumps(
                    {
                        "status_code": exc.response.status_code,
                        "request_path": exc.request.url.path,
                        "response": response_text,
                        "model": providers.understanding.model_name,
                    },
                    ensure_ascii=False,
                )
            )
            raise SystemExit(1) from None
        studio_seconds = time.monotonic() - studio_started
        verification = await providers.verifier.verify(parsed, understanding)
        parsed_by_id = {
            element.id: {"page": element.page, "text": element.text}
            for element in parsed.elements
        }
        anchors = list(understanding.source_anchors)
        anchors.extend(field.source_anchor for field in understanding.fields)
        anchors.extend(action.source_anchor for action in understanding.actions)

        print(
            json.dumps(
                {
                    "model": providers.understanding.model_name,
                    "parse_seconds": round(parse_seconds, 2),
                    "studio_seconds": round(studio_seconds, 2),
                    "total_seconds": round(parse_seconds + studio_seconds, 2),
                    "category": understanding.category.value,
                    "title": understanding.title,
                    "field_types": [field.field_type.value for field in understanding.fields],
                    "source_anchor_count": len(understanding.source_anchors),
                    "verification_passed": verification.passed,
                    "verification_issues": verification.issues,
                    "anchor_debug": [
                        {
                            "element_id": anchor.element_id,
                            "anchor_page": anchor.page,
                            "quote": anchor.quote,
                            "element": parsed_by_id.get(anchor.element_id),
                            "grounded": anchor_is_grounded(parsed, anchor),
                        }
                        for anchor in anchors
                    ]
                    if not verification.passed
                    else [],
                },
                ensure_ascii=False,
            )
        )
    finally:
        await providers.aclose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run an explicit real-Upstage Studio smoke test for a local PDF."
    )
    parser.add_argument("document", type=Path)
    args = parser.parse_args()
    asyncio.run(run_smoke(args.document))


if __name__ == "__main__":
    main()
