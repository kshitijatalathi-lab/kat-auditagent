import sys
from pathlib import Path
import warnings

# Ensure project root is on sys.path so 'api' and 'adk' can be imported in tests
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Test warning filters: suppress noisy, non-actionable deprecations from third-party libs
# 1) PyPDF2 package deprecation (we use pypdf, but environment may still have PyPDF2 installed)
warnings.filterwarnings(
    "ignore",
    message=r"PyPDF2 is deprecated\. Please move to the pypdf library instead\.",
    category=DeprecationWarning,
)
# 2) PyMuPDF swig deprecation notices about builtin types lacking __module__
warnings.filterwarnings(
    "ignore",
    message=r"builtin type .* has no __module__ attribute",
    category=DeprecationWarning,
)
