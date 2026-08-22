from __future__ import annotations

import typer

from app.config import get_settings

cli = typer.Typer(help="DOCDO 운영 명령")


@cli.command("seed-demo")
def seed_demo() -> None:
    """Confirm that deterministic demo fixtures are available in mock mode."""
    settings = get_settings()
    typer.echo(
        "DOCDO mock fixtures are built in: BILL, PUBLIC_NOTICE, "
        f"INSURANCE_FINANCE (provider_mode={settings.provider_mode})."
    )


if __name__ == "__main__":
    cli()
