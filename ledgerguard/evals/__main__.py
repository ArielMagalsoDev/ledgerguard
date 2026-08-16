import sys

from ..db import init_db, session_scope
from ..seed import seed_all
from .run import run


def main() -> None:
    init_db()
    with session_scope() as db:
        seed_all(db)
        result = run(db)
    sys.exit(0 if result["passed"] == result["total"] else 1)


if __name__ == "__main__":
    main()
