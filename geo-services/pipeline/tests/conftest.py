"""Skip test files that need osmium (pyosmium) or the osmium CLI when they are not installed."""
import shutil
from pathlib import Path

collect_ignore_glob = []

try:
    import osmium  # noqa: F401
    _has_pyosmium = True
except ImportError:
    _has_pyosmium = False

_has_osmium_cli = shutil.which("osmium") is not None

if not _has_pyosmium or not _has_osmium_cli:
    # These files import osmium directly or through quality.metrics
    collect_ignore_glob.extend([
        str(Path(__file__).parent / "test_extract.py"),
        str(Path(__file__).parent / "test_metrics.py"),
        str(Path(__file__).parent / "test_compare.py"),
    ])
